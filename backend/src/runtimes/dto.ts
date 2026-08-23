import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MinLength } from 'class-validator';

export const RUNTIME_FAMILIES = ['NODEJS', 'PYTHON'] as const;
export type RuntimeFamily = (typeof RUNTIME_FAMILIES)[number];

export class CreateRuntimeEngineDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsString()
  description?: string;

  // Which of the two hardcoded startup-command conventions this engine
  // uses (npm/node vs pip/python) — see ServersService.defaultStartupCommand.
  @IsIn(RUNTIME_FAMILIES)
  family!: RuntimeFamily;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  displayOrder?: number;
}

export class UpdateRuntimeEngineDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(RUNTIME_FAMILIES)
  family?: RuntimeFamily;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  displayOrder?: number;
}

export class SetEnabledDto {
  @IsBoolean()
  enabled!: boolean;
}

export class CreateRuntimeVersionDto {
  @IsString()
  @MinLength(1)
  version!: string;

  // Docker image tag, e.g. "node:22-alpine" or "python:3.11-alpine".
  @IsString()
  @MinLength(1)
  image!: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  displayOrder?: number;
}

export class UpdateRuntimeVersionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  version?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  image?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  displayOrder?: number;
}

export class SetRuntimeDefaultsDto {
  @IsOptional()
  @IsString()
  runtimeEngineId?: string | null;

  @IsOptional()
  @IsString()
  runtimeVersionId?: string | null;
}
