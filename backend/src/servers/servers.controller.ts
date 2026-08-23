import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ServersService } from './servers.service';
import {
  CreateServerDto,
  RenameServerDto,
  UpdateSettingsDto,
  UpdateEnvDto,
  ImportGithubDto,
} from './dto';

@UseGuards(JwtAuthGuard)
@Controller('servers')
export class ServersController {
  constructor(private servers: ServersService) {}

  private isAdmin(user: any) {
    return user.role === 'ADMIN';
  }

  @Get()
  list(@CurrentUser() user: any) {
    return this.servers.list(user.id);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: any) {
    return this.servers.findOwned(id, user.id, this.isAdmin(user));
  }

  @Post()
  create(@Body() dto: CreateServerDto, @CurrentUser() user: any) {
    return this.servers.create(user.id, dto);
  }

  @Patch(':id/rename')
  rename(@Param('id') id: string, @Body() dto: RenameServerDto, @CurrentUser() user: any) {
    return this.servers.rename(id, user.id, dto.name, this.isAdmin(user));
  }

  @Patch(':id/settings')
  updateSettings(@Param('id') id: string, @Body() dto: UpdateSettingsDto, @CurrentUser() user: any) {
    return this.servers.updateSettings(id, user.id, dto, this.isAdmin(user));
  }

  @Patch(':id/env')
  updateEnv(@Param('id') id: string, @Body() dto: UpdateEnvDto, @CurrentUser() user: any) {
    return this.servers.updateEnv(id, user.id, dto.env, this.isAdmin(user));
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.servers.remove(id, user.id, this.isAdmin(user));
  }

  @Post(':id/suspend')
  suspend(@Param('id') id: string, @CurrentUser() user: any) {
    return this.servers.suspend(id, user.id, true, this.isAdmin(user));
  }

  @Post(':id/unsuspend')
  unsuspend(@Param('id') id: string, @CurrentUser() user: any) {
    return this.servers.suspend(id, user.id, false, this.isAdmin(user));
  }

  @Post(':id/start')
  start(@Param('id') id: string, @CurrentUser() user: any) {
    return this.servers.start(id, user.id, this.isAdmin(user));
  }

  @Post(':id/stop')
  stop(@Param('id') id: string, @CurrentUser() user: any) {
    return this.servers.stop(id, user.id, this.isAdmin(user));
  }

  @Post(':id/restart')
  restart(@Param('id') id: string, @CurrentUser() user: any) {
    return this.servers.restart(id, user.id, this.isAdmin(user));
  }

  @Post(':id/kill')
  kill(@Param('id') id: string, @CurrentUser() user: any) {
    return this.servers.kill(id, user.id, this.isAdmin(user));
  }

  @Post(':id/install')
  install(@Param('id') id: string, @CurrentUser() user: any) {
    return this.servers.installDependencies(id, user.id, this.isAdmin(user));
  }

  @Get(':id/stats')
  stats(@Param('id') id: string, @CurrentUser() user: any) {
    return this.servers.getStats(id, user.id, this.isAdmin(user));
  }

  @Post(':id/github-import')
  githubImport(@Param('id') id: string, @Body() dto: ImportGithubDto, @CurrentUser() user: any) {
    return this.servers.importGithub(id, user.id, dto, this.isAdmin(user));
  }

  @Post(':id/github-pull')
  githubPull(@Param('id') id: string, @CurrentUser() user: any) {
    return this.servers.pullLatest(id, user.id, this.isAdmin(user));
  }

  @Get(':id/info')
  info(@Param('id') id: string, @CurrentUser() user: any) {
    return this.servers.getInfo(id, user.id, this.isAdmin(user));
  }
}
