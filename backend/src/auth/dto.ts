import { IsEmail, IsString, IsBoolean, IsOptional, IsIn, MinLength, Matches, Validate } from 'class-validator';
import { ValidatorConstraint, ValidatorConstraintInterface, ValidationArguments } from 'class-validator';

@ValidatorConstraint({ name: 'PasswordsMatch', async: false })
class PasswordsMatchConstraint implements ValidatorConstraintInterface {
  validate(confirmPassword: string, args: ValidationArguments) {
    const obj = args.object as RegisterDto;
    return confirmPassword === obj.password;
  }
  defaultMessage() {
    return 'passwordConfirmation must match password';
  }
}

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Matches(/^[a-zA-Z0-9_-]{3,20}$/, {
    message: 'username must be 3-20 chars: letters, numbers, _ or -',
  })
  username!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @Validate(PasswordsMatchConstraint)
  passwordConfirmation!: string;
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;

  // Extends the refresh-token / session lifetime when true (see AuthService).
  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}

export class ForgotPasswordDto {
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Matches(/^[0-9]{6}$/, { message: 'code must be a 6-digit number' })
  code!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}

export class ChangePasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}

export class VerifyEmailDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Matches(/^[0-9]{6}$/, { message: 'code must be a 6-digit number' })
  code!: string;
}

export class ResendOtpDto {
  @IsEmail()
  email!: string;

  @IsIn(['EMAIL_VERIFICATION', 'PASSWORD_RESET'])
  purpose!: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET';
}
