<?php

namespace Tests\Unit;

use App\Enums\TransactionType;
use PHPUnit\Framework\TestCase;

class TransactionTypeTest extends TestCase
{
    public function test_is_expense_type_returns_true_for_expense(): void
    {
        $this->assertTrue(TransactionType::isExpenseType('expense'));
    }

    public function test_is_expense_type_returns_true_for_savings(): void
    {
        $this->assertTrue(TransactionType::isExpenseType('savings'));
    }

    public function test_is_expense_type_returns_true_for_correction(): void
    {
        $this->assertTrue(TransactionType::isExpenseType('correction'));
    }

    public function test_is_expense_type_returns_false_for_income_types(): void
    {
        $this->assertFalse(TransactionType::isExpenseType('salary'));
        $this->assertFalse(TransactionType::isExpenseType('advance'));
        $this->assertFalse(TransactionType::isExpenseType('bonus'));
    }

    public function test_is_expense_type_returns_false_for_savings_withdrawal(): void
    {
        $this->assertFalse(TransactionType::isExpenseType('savings_withdrawal'));
    }

    public function test_is_income_type_returns_true_for_salary(): void
    {
        $this->assertTrue(TransactionType::isIncomeType('salary'));
    }

    public function test_is_income_type_returns_true_for_advance(): void
    {
        $this->assertTrue(TransactionType::isIncomeType('advance'));
    }

    public function test_is_income_type_returns_false_for_expense(): void
    {
        $this->assertFalse(TransactionType::isIncomeType('expense'));
    }

    public function test_is_income_type_returns_false_for_savings(): void
    {
        $this->assertFalse(TransactionType::isIncomeType('savings'));
    }

    public function test_is_income_type_returns_false_for_savings_withdrawal(): void
    {
        $this->assertFalse(TransactionType::isIncomeType('savings_withdrawal'));
    }
}
