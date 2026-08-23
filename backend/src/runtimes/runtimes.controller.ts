import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RuntimesService } from './runtimes.service';
import {
  CreateRuntimeEngineDto,
  CreateRuntimeVersionDto,
  SetEnabledDto,
  SetRuntimeDefaultsDto,
  UpdateRuntimeEngineDto,
  UpdateRuntimeVersionDto,
} from './dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('runtimes')
export class RuntimesController {
  constructor(private readonly runtimes: RuntimesService) {}

  // ===================================================================
  // Public, unauthenticated catalog — every role reads this to
  // create/reconfigure their own servers (Create Server step + Server
  // Settings picker), and it also powers the landing page's "Supported
  // Runtimes" section. Enabled-only. No sensitive fields (name/icon/
  // description/versions only), same reasoning as the Plans public
  // catalog, so making it public doesn't change what's exposed to an
  // authenticated caller — just lets logged-out visitors read it too.
  // ===================================================================
  @Get()
  async getCatalog() {
    const [engines, defaults] = await Promise.all([
      this.runtimes.listEngines({ activeOnly: true, withVersions: true, activeVersionsOnly: true }),
      this.runtimes.getDefaults(),
    ]);
    return { runtimes: engines, defaults };
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getOne(@Param('id') id: string) {
    if (id === 'admin') throw new NotFoundException('Not found');
    const engine = await this.runtimes.getEngine(id, { withVersions: true, activeVersionsOnly: true });
    if (!engine || !engine.enabled) throw new NotFoundException('Runtime not found');
    return { runtime: engine };
  }

  // ===================================================================
  // Admin — Runtime Manager
  // ===================================================================

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('admin/list')
  async search(@Query('search') search?: string, @Query('enabled') enabled?: string) {
    const [runtimes, defaults] = await Promise.all([
      this.runtimes.searchEngines({ search, enabled }),
      this.runtimes.getDefaults(),
    ]);
    return { runtimes, defaults };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('admin/defaults')
  getDefaults() {
    return this.runtimes.getDefaults().then((defaults) => ({ defaults }));
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch('admin/defaults')
  async setDefaults(@Body() dto: SetRuntimeDefaultsDto, @CurrentUser() admin: { id: string }) {
    const result = await this.runtimes.setDefaults(dto.runtimeEngineId, dto.runtimeVersionId, admin.id);
    if (result.errors) throw new BadRequestException(result.errors.join('; '));
    return { message: 'Default runtime updated', defaults: result.defaults };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('admin/:id')
  async getOneAdmin(@Param('id') id: string) {
    const engine = await this.runtimes.getEngine(id, { withVersions: true });
    if (!engine) throw new NotFoundException('Runtime not found');
    const serversUsingRuntime = await this.runtimes.serversUsingEngine(id);
    return { runtime: engine, serversUsingRuntime };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post('admin')
  async create(@Body() dto: CreateRuntimeEngineDto) {
    const result = await this.runtimes.createEngine(dto);
    if (result.errors) throw new BadRequestException(result.errors.join('; '));
    return { message: 'Runtime created', runtime: result.engine };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch('admin/:id')
  async update(@Param('id') id: string, @Body() dto: UpdateRuntimeEngineDto) {
    const result = await this.runtimes.updateEngine(id, dto);
    if (result.errors) {
      if (result.errors[0] === 'Runtime not found') throw new NotFoundException(result.errors[0]);
      throw new BadRequestException(result.errors.join('; '));
    }
    return { message: 'Runtime saved', runtime: result.engine };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch('admin/:id/status')
  async setStatus(@Param('id') id: string, @Body() dto: SetEnabledDto) {
    const result = await this.runtimes.setEngineEnabled(id, dto.enabled);
    if (result.errors) throw new NotFoundException(result.errors.join('; '));
    return { message: dto.enabled ? 'Runtime enabled' : 'Runtime disabled', runtime: result.engine };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Delete('admin/:id')
  async remove(@Param('id') id: string) {
    const result = await this.runtimes.deleteEngine(id);
    if (result.errors) {
      if (result.errors[0] === 'Runtime not found') throw new NotFoundException(result.errors[0]);
      throw new ConflictException(result.errors.join('; '));
    }
    return { message: 'Runtime deleted' };
  }

  // ---- Versions, nested under an engine ----------------------------------

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post('admin/:id/versions')
  async addVersion(@Param('id') id: string, @Body() dto: CreateRuntimeVersionDto) {
    const result = await this.runtimes.createVersion(id, dto);
    if (result.errors) {
      if (result.errors[0] === 'Runtime not found') throw new NotFoundException(result.errors[0]);
      throw new BadRequestException(result.errors.join('; '));
    }
    return { message: 'Version added', version: result.version };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch('admin/:id/versions/:versionId')
  async updateVersion(@Param('versionId') versionId: string, @Body() dto: UpdateRuntimeVersionDto) {
    const result = await this.runtimes.updateVersion(versionId, dto);
    if (result.errors) {
      if (result.errors[0] === 'Runtime version not found') throw new NotFoundException(result.errors[0]);
      throw new BadRequestException(result.errors.join('; '));
    }
    return { message: 'Version saved', version: result.version };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch('admin/:id/versions/:versionId/status')
  async setVersionStatus(@Param('versionId') versionId: string, @Body() dto: SetEnabledDto) {
    const result = await this.runtimes.setVersionEnabled(versionId, dto.enabled);
    if (result.errors) throw new NotFoundException(result.errors.join('; '));
    return { message: dto.enabled ? 'Version enabled' : 'Version disabled', version: result.version };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Delete('admin/:id/versions/:versionId')
  async removeVersion(@Param('versionId') versionId: string) {
    const result = await this.runtimes.deleteVersion(versionId);
    if (result.errors) {
      if (result.errors[0] === 'Runtime version not found') throw new NotFoundException(result.errors[0]);
      throw new ConflictException(result.errors.join('; '));
    }
    return { message: 'Version deleted' };
  }
}
