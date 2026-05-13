<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('transactions', function (Blueprint $table) {
            $table->index(['client_id', 'type', 'date'], 'idx_tx_client_type_date');
            $table->index(['client_id', 'recurring_payment_id', 'month'], 'idx_tx_client_payment_month');
            $table->index(['client_id', 'description'], 'idx_tx_client_description');
        });

        Schema::table('recurring_payments', function (Blueprint $table) {
            $table->index(['client_id', 'is_active', 'day_of_month'], 'idx_rp_client_active_day');
            $table->index(['is_auto_debit', 'is_active', 'day_of_month'], 'idx_rp_autodebit_active_day');
        });

        Schema::table('goals', function (Blueprint $table) {
            $table->index(['client_id', 'is_active', 'target_date'], 'idx_goals_client_active_date');
        });

        Schema::table('category_budgets', function (Blueprint $table) {
            $table->index(['client_id', 'month'], 'idx_cb_client_month');
        });

        if (Schema::hasTable('categorization_rules')) {
            Schema::table('categorization_rules', function (Blueprint $table) {
                $table->index(['client_id', 'merchant_pattern'], 'idx_cr_client_pattern');
            });
        }
    }

    public function down(): void
    {
        Schema::table('transactions', function (Blueprint $table) {
            $table->dropIndex('idx_tx_client_type_date');
            $table->dropIndex('idx_tx_client_payment_month');
            $table->dropIndex('idx_tx_client_description');
        });

        Schema::table('recurring_payments', function (Blueprint $table) {
            $table->dropIndex('idx_rp_client_active_day');
            $table->dropIndex('idx_rp_autodebit_active_day');
        });

        Schema::table('goals', function (Blueprint $table) {
            $table->dropIndex('idx_goals_client_active_date');
        });

        Schema::table('category_budgets', function (Blueprint $table) {
            $table->dropIndex('idx_cb_client_month');
        });

        if (Schema::hasTable('categorization_rules')) {
            Schema::table('categorization_rules', function (Blueprint $table) {
                $table->dropIndex('idx_cr_client_pattern');
            });
        }
    }
};
