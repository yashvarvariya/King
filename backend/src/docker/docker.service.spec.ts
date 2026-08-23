import { Test } from '@nestjs/testing';
import { DockerService } from './docker.service';

// Mock the whole `dockerode` module so these tests never touch a real
// Docker daemon / socket. `new Docker(...)` returns an object whose
// container-scoped methods we control per-test via `mockContainer`.
const mockContainer = {
  start: jest.fn(),
  stop: jest.fn(),
  kill: jest.fn(),
  restart: jest.fn(),
  remove: jest.fn(),
  inspect: jest.fn(),
  stats: jest.fn(),
  attach: jest.fn(),
  exec: jest.fn(),
};

const mockDockerInstance = {
  createContainer: jest.fn(),
  getContainer: jest.fn(() => mockContainer),
  listImages: jest.fn(),
  pull: jest.fn(),
  modem: { followProgress: jest.fn() },
};

jest.mock('dockerode', () => {
  return jest.fn().mockImplementation(() => mockDockerInstance);
});

describe('DockerService', () => {
  let service: DockerService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({ providers: [DockerService] }).compile();
    service = module.get(DockerService);
  });

  describe('createContainer', () => {
    it('pulls the runtime image if missing, then creates the container', async () => {
      mockDockerInstance.listImages.mockResolvedValue([]); // image not present -> triggers pull
      mockDockerInstance.pull.mockImplementation((_image: string, cb: any) => cb(null, 'stream'));
      mockDockerInstance.modem.followProgress.mockImplementation((_stream: any, done: any) => done(null));
      mockDockerInstance.createContainer.mockResolvedValue({ id: 'container-123' });

      const id = await service.createContainer({
        containerName: 'bot-1',
        hostPath: '/data/bot-1',
        runtime: 'NODEJS',
        startupCommand: 'node index.js',
        env: { FOO: 'bar' },
        memoryLimitMb: 512,
        cpuLimitPercent: 50,
      });

      expect(mockDockerInstance.pull).toHaveBeenCalled();
      expect(mockDockerInstance.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'bot-1',
          Image: 'node:20-alpine',
          Env: ['FOO=bar'],
          Cmd: ['sh', '-c', 'node index.js'],
          HostConfig: expect.objectContaining({
            Memory: 512 * 1024 * 1024,
            CpuQuota: 50000, // 50% of a core at CpuPeriod 100000
          }),
        }),
      );
      expect(id).toBe('container-123');
    });

    it('skips pulling when the image is already present', async () => {
      mockDockerInstance.listImages.mockResolvedValue([{ Id: 'sha256:already-here' }]);
      mockDockerInstance.createContainer.mockResolvedValue({ id: 'container-456' });

      await service.createContainer({
        containerName: 'bot-2',
        hostPath: '/data/bot-2',
        runtime: 'PYTHON',
        startupCommand: 'python main.py',
        env: {},
        memoryLimitMb: 256,
        cpuLimitPercent: 100,
      });

      expect(mockDockerInstance.pull).not.toHaveBeenCalled();
    });
  });

  describe('lifecycle actions', () => {
    it('start() starts the named container', async () => {
      await service.start('c1');
      expect(mockDockerInstance.getContainer).toHaveBeenCalledWith('c1');
      expect(mockContainer.start).toHaveBeenCalled();
    });

    it('stop() swallows "already stopped" (304) errors', async () => {
      mockContainer.stop.mockRejectedValue({ statusCode: 304 });
      await expect(service.stop('c1')).resolves.toBeUndefined();
    });

    it('stop() rethrows unexpected errors', async () => {
      mockContainer.stop.mockRejectedValue({ statusCode: 500 });
      await expect(service.stop('c1')).rejects.toEqual({ statusCode: 500 });
    });

    it('remove() swallows "not found" (404) errors', async () => {
      mockContainer.remove.mockRejectedValue({ statusCode: 404 });
      await expect(service.remove('c1')).resolves.toBeUndefined();
    });
  });

  describe('stats', () => {
    it('computes CPU percent and memory usage from raw Docker stats', async () => {
      mockContainer.stats.mockResolvedValue({
        cpu_stats: { cpu_usage: { total_usage: 2000 }, system_cpu_usage: 10000, online_cpus: 2 },
        precpu_stats: { cpu_usage: { total_usage: 1000 }, system_cpu_usage: 8000 },
        memory_stats: { usage: 100 * 1024 * 1024, limit: 512 * 1024 * 1024 },
      });

      const result = await service.stats('c1');

      // cpuDelta=1000, systemDelta=2000 -> (1000/2000)*2*100 = 100%
      expect(result.cpuPercent).toBe(100);
      expect(result.memoryUsedMb).toBe(100);
      expect(result.memoryLimitMb).toBe(512);
    });
  });
});
