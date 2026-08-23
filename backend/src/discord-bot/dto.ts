import { IsOptional, IsString } from 'class-validator';

export class SaveDiscordSettingsDto {
  @IsOptional()
  @IsString()
  botToken?: string;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  guildId?: string;

  @IsOptional()
  @IsString()
  ownerDiscordId?: string;
}

export class TestDiscordConnectionDto {
  @IsOptional()
  @IsString()
  botToken?: string;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  guildId?: string;
}
