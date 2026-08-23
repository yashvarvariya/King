import { IsEmail, IsString, Matches, MinLength } from 'class-validator';

export class UpdateUsernameDto {
  // Same shape as RegisterDto.username — kept in sync intentionally.
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]{3,20}$/, {
    message: 'username must be 3-20 chars: letters, numbers, _ or -',
  })
  username!: string;
}

export class RequestEmailChangeDto {
  @IsEmail()
  newEmail!: string;

  // Changing the login email is security-sensitive, so it's gated behind
  // re-entering the current password — same reasoning as ChangePasswordDto.
  @IsString()
  currentPassword!: string;
}

export class ConfirmEmailChangeDto {
  @IsString()
  @Matches(/^[0-9]{6}$/, { message: 'code must be a 6-digit number' })
  code!: string;
}
