import { IsArray, IsBoolean, IsEmail, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class UpdateSmtpSettingsDto {
  @IsString()
  @MinLength(1)
  host!: string;

  @IsInt()
  @Min(1)
  port!: number;

  @IsOptional()
  @IsBoolean()
  secure?: boolean;

  @IsOptional()
  @IsString()
  username?: string;

  // Optional on update — omit/blank to keep the currently stored password
  // so the admin isn't forced to re-enter it every time they tweak the
  // sender name.
  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsString()
  senderName?: string;

  @IsOptional()
  @IsEmail()
  senderEmail?: string;
}

export class TestSmtpDto {
  @IsEmail()
  to!: string;
}

export class UpdateEmailTemplateDto {
  @IsString()
  @MinLength(1)
  subject!: string;

  @IsString()
  @MinLength(1)
  title!: string;

  @IsString()
  @MinLength(1)
  body!: string;

  @IsOptional()
  @IsString()
  footer?: string;
}

export class UpdateEmailValidationSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedDomains?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  blockedDomains?: string[];
}

export class AddDomainDto {
  @IsString()
  @MinLength(1)
  domain!: string;
}
