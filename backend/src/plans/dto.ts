import { IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export const PLAN_BADGES = ['NONE', 'FREE', 'MOST_POPULAR', 'BEST_VALUE', 'NEW', 'LIMITED_OFFER'] as const;
export type PlanBadgeValue = (typeof PLAN_BADGES)[number];

export class CreatePlanDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  oldPrice?: number;

  @IsNumber()
  @Min(0)
  price!: number;

  @IsString()
  @MinLength(1)
  ram!: string;

  @IsString()
  @MinLength(1)
  storage!: string;

  @IsString()
  @MinLength(1)
  cpu!: string;

  // Free-form on purpose ("Unlimited" or a plain number as a string) to
  // match the storefront copy admins are used to typing.
  @IsString()
  @MinLength(1)
  maxServers!: string;

  @IsOptional()
  @IsBoolean()
  lifetime?: boolean;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsInt()
  displayOrder?: number;

  @IsOptional()
  @IsIn(PLAN_BADGES)
  badge?: PlanBadgeValue;
}

export class UpdatePlanDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  oldPrice?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  ram?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  storage?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  cpu?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  maxServers?: string;

  @IsOptional()
  @IsBoolean()
  lifetime?: boolean;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsInt()
  displayOrder?: number;

  @IsOptional()
  @IsIn(PLAN_BADGES)
  badge?: PlanBadgeValue;
}

export class SetPlanActiveDto {
  @IsBoolean()
  active!: boolean;
}

export class ReorderPlansDto {
  @IsArray()
  @IsString({ each: true })
  order!: string[];
}
