import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { FilesService } from './files.service';

@UseGuards(JwtAuthGuard)
@Controller('servers/:serverId/files')
export class FilesController {
  constructor(private files: FilesService) {}

  private isAdmin(user: any) {
    return user.role === 'ADMIN';
  }

  @Get()
  list(@Param('serverId') serverId: string, @Query('path') path: string = '.', @CurrentUser() user: any) {
    return this.files.list(serverId, user.id, path, this.isAdmin(user));
  }

  @Get('content')
  read(@Param('serverId') serverId: string, @Query('path') path: string, @CurrentUser() user: any) {
    return this.files.readFile(serverId, user.id, path, this.isAdmin(user)).then((content) => ({ content }));
  }

  @Post('content')
  write(
    @Param('serverId') serverId: string,
    @Body() body: { path: string; content: string },
    @CurrentUser() user: any,
  ) {
    return this.files.writeFile(serverId, user.id, body.path, body.content, this.isAdmin(user));
  }

  @Post('create')
  create(
    @Param('serverId') serverId: string,
    @Body() body: { path: string; type: 'file' | 'directory' },
    @CurrentUser() user: any,
  ) {
    return this.files.createEntry(serverId, user.id, body.path, body.type, this.isAdmin(user));
  }

  @Post('rename')
  rename(
    @Param('serverId') serverId: string,
    @Body() body: { path: string; newName: string },
    @CurrentUser() user: any,
  ) {
    return this.files.rename(serverId, user.id, body.path, body.newName, this.isAdmin(user));
  }

  @Delete()
  remove(@Param('serverId') serverId: string, @Query('path') path: string, @CurrentUser() user: any) {
    return this.files.remove(serverId, user.id, path, this.isAdmin(user));
  }

  @Post('move')
  move(
    @Param('serverId') serverId: string,
    @Body() body: { path: string; destPath: string },
    @CurrentUser() user: any,
  ) {
    return this.files.move(serverId, user.id, body.path, body.destPath, this.isAdmin(user));
  }

  @Post('copy')
  copy(
    @Param('serverId') serverId: string,
    @Body() body: { path: string; destPath: string },
    @CurrentUser() user: any,
  ) {
    return this.files.copy(serverId, user.id, body.path, body.destPath, this.isAdmin(user));
  }

  @Get('properties')
  properties(@Param('serverId') serverId: string, @Query('path') path: string, @CurrentUser() user: any) {
    return this.files.properties(serverId, user.id, path, this.isAdmin(user));
  }

  /** Extracts a ZIP that already lives on disk (e.g. one uploaded via the normal Upload button), keeping the original ZIP. */
  @Post('extract')
  extract(@Param('serverId') serverId: string, @Body() body: { path: string }, @CurrentUser() user: any) {
    return this.files.extractExisting(serverId, user.id, body.path, this.isAdmin(user));
  }

  /** Compresses a file/folder into a sibling `.zip`, leaving the source untouched. */
  @Post('compress')
  compress(@Param('serverId') serverId: string, @Body() body: { path: string }, @CurrentUser() user: any) {
    return this.files.compress(serverId, user.id, body.path, this.isAdmin(user));
  }

  /** Downloads a single file as-is, or a folder as an on-the-fly generated ZIP. */
  @Get('download')
  async download(
    @Param('serverId') serverId: string,
    @Query('path') path: string,
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    const result = await this.files.resolveDownload(serverId, user.id, path, this.isAdmin(user));
    res.setHeader('Content-Disposition', `attachment; filename="${result.fileName.replace(/"/g, '')}"`);
    res.setHeader('Content-Type', result.kind === 'zip' ? 'application/zip' : 'application/octet-stream');
    (result.stream as NodeJS.ReadableStream).pipe(res);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 512 * 1024 * 1024 } }))
  async upload(
    @Param('serverId') serverId: string,
    @Query('path') destPath: string = '.',
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.files.saveUpload(serverId, user.id, destPath, file.originalname, file.buffer, this.isAdmin(user));
  }

  @Post('upload-zip')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 512 * 1024 * 1024 } }))
  async uploadZip(
    @Param('serverId') serverId: string,
    @Query('path') destPath: string = '.',
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    if (!file) throw new BadRequestException('No ZIP uploaded');
    return this.files.extractZip(serverId, user.id, file.buffer, destPath, this.isAdmin(user));
  }
}
