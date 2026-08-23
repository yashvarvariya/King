import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateQuotasDto {
  @IsOptional() @IsInt() @Min(0)
  maxServers?: number;

  @IsOptional() @IsInt() @Min(64)
  maxMemoryMb?: number;

  @IsOptional() @IsInt() @Min(100)
  maxDiskMb?: number;

  @IsOptional() @IsInt() @Min(10)
  maxCpuPercent?: number;

  @IsOptional() @IsInt() @Min(0)
  backupLimit?: number;

  @IsOptional() @IsBoolean()
  suspended?: boolean;
}

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString() @MinLength(3)
  username!: string;

  @IsString() @MinLength(8)
  password!: string;

  @IsOptional() @IsIn(['USER', 'ADMIN'])
  role?: 'USER' | 'ADMIN';

  @IsOptional() @IsBoolean()
  isPremium?: boolean;
}

export class AdminCreateServerDto {
  @IsString()
  ownerId!: string;

  @IsString() @MinLength(1)
  name!: string;

  @IsIn(['NODEJS', 'PYTHON'])
  runtime!: 'NODEJS' | 'PYTHON';

  @IsOptional() @IsString()
  startupCommand?: string;
}
