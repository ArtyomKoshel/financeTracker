<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // accounts.client_id → users.id
        Schema::table('accounts', function (Blueprint $table) {
            $table->foreign('client_id')->references('id')->on('users')->cascadeOnDelete();
        });

        // categories.client_id → users.id, parent_id → categories.id
        Schema::table('categories', function (Blueprint $table) {
            $table->foreign('client_id')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('parent_id')->references('id')->on('categories')->nullOnDelete();
        });

        // transactions FK + composite indexes for analytics
        Schema::table('transactions', function (Blueprint $table) {
            $table->foreign('client_id')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('category_id')->references('id')->on('categories')->nullOnDelete();
            $table->foreign('account_id')->references('id')->on('accounts')->cascadeOnDelete();
            $table->foreign('recurring_payment_id')->references('id')->on('recurring_payments')->nullOnDelete();
            $table->index(['client_id', 'month']);
            $table->index(['client_id', 'date']);
        });

        // goals.client_id → users.id
        Schema::table('goals', function (Blueprint $table) {
            $table->foreign('client_id')->references('id')->on('users')->cascadeOnDelete();
        });

        // settings.client_id → users.id
        Schema::table('settings', function (Blueprint $table) {
            $table->foreign('client_id')->references('id')->on('users')->cascadeOnDelete();
        });

        // settings_history.client_id → users.id
        Schema::table('settings_history', function (Blueprint $table) {
            $table->foreign('client_id')->references('id')->on('users')->cascadeOnDelete();
        });

        // recurring_payments.client_id → users.id
        Schema::table('recurring_payments', function (Blueprint $table) {
            $table->foreign('client_id')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('category_id')->references('id')->on('categories')->nullOnDelete();
            $table->index(['client_id', 'is_active']);
        });

        // payment_history.payment_id → recurring_payments.id
        Schema::table('payment_history', function (Blueprint $table) {
            $table->foreign('payment_id')->references('id')->on('recurring_payments')->cascadeOnDelete();
        });

        // category_budgets FK + composite index for analytics
        Schema::table('category_budgets', function (Blueprint $table) {
            $table->foreign('client_id')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('category_id')->references('id')->on('categories')->cascadeOnDelete();
            $table->index(['client_id', 'category_id', 'month']);
        });

        // debts.client_id → users.id (if table exists)
        if (Schema::hasTable('debts')) {
            Schema::table('debts', function (Blueprint $table) {
                $table->foreign('client_id')->references('id')->on('users')->cascadeOnDelete();
            });
        }

        // envelopes.client_id → users.id (if table exists)
        if (Schema::hasTable('envelopes')) {
            Schema::table('envelopes', function (Blueprint $table) {
                $table->foreign('client_id')->references('id')->on('users')->cascadeOnDelete();
            });
        }
    }

    public function down(): void
    {
        $tables = [
            'accounts' => ['accounts_client_id_foreign'],
            'categories' => ['categories_client_id_foreign', 'categories_parent_id_foreign'],
            'transactions' => ['transactions_client_id_foreign', 'transactions_category_id_foreign', 'transactions_account_id_foreign', 'transactions_recurring_payment_id_foreign'],
            'goals' => ['goals_client_id_foreign'],
            'settings' => ['settings_client_id_foreign'],
            'settings_history' => ['settings_history_client_id_foreign'],
            'recurring_payments' => ['recurring_payments_client_id_foreign', 'recurring_payments_category_id_foreign'],
            'payment_history' => ['payment_history_payment_id_foreign'],
            'category_budgets' => ['category_budgets_client_id_foreign', 'category_budgets_category_id_foreign'],
        ];

        foreach ($tables as $tableName => $foreignKeys) {
            if (Schema::hasTable($tableName)) {
                Schema::table($tableName, function (Blueprint $table) use ($foreignKeys) {
                    foreach ($foreignKeys as $fk) {
                        $table->dropForeign($fk);
                    }
                });
            }
        }

        if (Schema::hasTable('debts')) {
            Schema::table('debts', function (Blueprint $table) {
                $table->dropForeign('debts_client_id_foreign');
            });
        }

        if (Schema::hasTable('envelopes')) {
            Schema::table('envelopes', function (Blueprint $table) {
                $table->dropForeign('envelopes_client_id_foreign');
            });
        }

        // Drop added indexes
        Schema::table('transactions', function (Blueprint $table) {
            $table->dropIndex(['client_id', 'month']);
            $table->dropIndex(['client_id', 'date']);
        });

        Schema::table('recurring_payments', function (Blueprint $table) {
            $table->dropIndex(['client_id', 'is_active']);
        });

        Schema::table('category_budgets', function (Blueprint $table) {
            $table->dropIndex(['client_id', 'category_id', 'month']);
        });
    }
};
