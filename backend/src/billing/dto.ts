import { IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsPositive, IsString, Min, MinLength } from 'class-validator';

export class UpdateBillingStatsDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  totalRevenue?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlyRevenue?: number;
}

export class AssignSubscriptionDto {
  @IsString()
  @MinLength(1)
  planId!: string;

  @IsOptional()
  @IsDateString()
  activationDate?: string;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;
}

export class ChangePlanDto {
  @IsString()
  @MinLength(1)
  planId!: string;
}

export class ExtendSubscriptionDto {
  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  days?: number;
}

export class NoteDto {
  @IsOptional()
  @IsString()
  note?: string;
}

export const SUBSCRIPTION_STATUSES = ['ACTIVE', 'SUSPENDED', 'EXPIRED', 'CANCELLED'] as const;

export class ListSubscriptionsQueryDto {
  @IsOptional()
  @IsIn(SUBSCRIPTION_STATUSES)
  status?: (typeof SUBSCRIPTION_STATUSES)[number];
}
