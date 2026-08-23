import { IsString, IsOptional, IsIn, MinLength, MaxLength, IsBoolean, IsObject, IsInt, Min, Max } from 'class-validator';

export class CreateServerDto {
  @IsString() @MinLength(2) @MaxLength(50)
  name!: string;

  @IsOptional() @IsString() @MaxLength(280)
  description?: string;

  @IsIn(['NODEJS', 'PYTHON'])
  runtime!: 'NODEJS' | 'PYTHON';

  @IsOptional() @IsString()
  startupCommand?: string;

  // Optional Runtime Manager catalog selection (Admin > Runtime Manager).
  // When provided, both must be set together and must actually belong to
  // each other — validated in ServersService against RuntimesService.
  // Omit both to keep the legacy behavior (image chosen purely from
  // `runtime` via DockerService's hardcoded map).
  @IsOptional() @IsString()
  runtimeEngineId?: string;

  @IsOptional() @IsString()
  runtimeVersionId?: string;
}

export class RenameServerDto {
  @IsString() @MinLength(2) @MaxLength(50)
  name!: string;
}

export class UpdateSettingsDto {
  @IsOptional() @IsString()
  startupCommand?: string;

  @IsOptional() @IsBoolean()
  autoRestart?: boolean;

  @IsOptional() @IsBoolean()
  autoBackupEnabled?: boolean;

  @IsOptional() @IsInt() @Min(1) @Max(30)
  backupRetention?: number;

  // Changing runtime/version here takes effect the next time the server's
  // container is (re)created (see ServersService.ensureContainer) — the
  // currently-running container isn't touched until then.
  @IsOptional() @IsString()
  runtimeEngineId?: string;

  @IsOptional() @IsString()
  runtimeVersionId?: string;
}

export class UpdateEnvDto {
  @IsObject()
  env!: Record<string, string>;
}

export class ImportGithubDto {
  @IsString()
  repoUrl!: string;

  @IsOptional() @IsString()
  branch?: string;
}
