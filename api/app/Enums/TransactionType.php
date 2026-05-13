<?php

namespace App\Enums;

/**
 * Transaction type constants. Migrate to PHP 8.1 BackedEnum when PHP 8.2+ is in use.
 */
class TransactionType
{
    public const EXPENSE = 'expense';

    public const SAVINGS = 'savings';

    public const SAVINGS_WITHDRAWAL = 'savings_withdrawal';

    public const CORRECTION = 'correction';

    /** @var string[] */
    public const EXPENSE_TYPES = [self::EXPENSE, self::SAVINGS, self::CORRECTION];

    /** @var string[] */
    public const NON_INCOME_TYPES = [self::EXPENSE, self::SAVINGS, self::SAVINGS_WITHDRAWAL, self::CORRECTION];

    public static function isExpenseType(string $type): bool
    {
        return in_array($type, self::EXPENSE_TYPES, true);
    }

    public static function isIncomeType(string $type): bool
    {
        return ! in_array($type, self::NON_INCOME_TYPES, true);
    }
}
