<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateFinanceTables extends Migration
{
    public function up()
    {
        Schema::create('accounts', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->decimal('balance', 15, 2)->default(0);
            $table->date('last_sync_date')->nullable();
            $table->decimal('last_sync_amount', 15, 2)->nullable();
            $table->unsignedBigInteger('client_id');
            $table->timestamps();
            $table->index('client_id');
        });

        Schema::create('categories', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->unsignedBigInteger('parent_id')->nullable();
            $table->string('icon')->nullable();
            $table->string('color')->nullable();
            $table->integer('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->unsignedBigInteger('client_id');
            $table->timestamps();
            $table->index('client_id');
            $table->index('parent_id');
        });

        Schema::create('transactions', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('client_id');
            $table->date('date');
            $table->decimal('amount', 15, 2);
            $table->decimal('original_amount', 15, 2)->nullable();
            $table->string('currency', 10)->default('BYN');
            $table->decimal('exchange_rate', 15, 6)->nullable();
            $table->string('type');
            $table->unsignedBigInteger('category_id')->nullable();
            $table->unsignedBigInteger('account_id')->default(1);
            $table->unsignedBigInteger('recurring_payment_id')->nullable();
            $table->text('description')->nullable();
            $table->string('month', 7)->nullable();
            $table->boolean('is_validated')->default(false);
            $table->timestamps();
            $table->index('client_id');
            $table->index('date');
            $table->index('month');
            $table->index('type');
            $table->index('category_id');
            $table->index('account_id');
        });

        Schema::create('goals', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('client_id');
            $table->string('name');
            $table->decimal('target_amount', 15, 2);
            $table->date('target_date');
            $table->decimal('current_amount', 15, 2)->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->index('client_id');
        });

        Schema::create('settings', function (Blueprint $table) {
            $table->unsignedBigInteger('client_id');
            $table->string('key');
            $table->text('value');
            $table->primary(['client_id', 'key']);
            $table->index('client_id');
        });

        Schema::create('settings_history', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('client_id');
            $table->string('key');
            $table->text('value');
            $table->date('valid_from');
            $table->date('valid_to')->nullable();
            $table->timestamps();
            $table->index(['client_id', 'key']);
        });

        Schema::create('recurring_payments', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('client_id');
            $table->string('name');
            $table->decimal('amount', 15, 2);
            $table->decimal('original_amount', 15, 2)->nullable();
            $table->string('currency', 10)->default('BYN');
            $table->integer('day_of_month');
            $table->date('due_date')->nullable();
            $table->string('category', 50)->default('essential');
            $table->unsignedBigInteger('category_id')->nullable();
            $table->boolean('is_variable')->default(false);
            $table->boolean('is_one_time')->default(false);
            $table->text('description')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->index('client_id');
        });

        Schema::create('payment_history', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('payment_id');
            $table->date('paid_date');
            $table->decimal('amount', 15, 2);
            $table->string('month', 7);
            $table->index('payment_id');
            $table->index('month');
        });

        Schema::create('budgets', function (Blueprint $table) {
            $table->id();
            $table->string('month', 7)->unique();
            $table->decimal('total_limit', 15, 2)->nullable();
            $table->decimal('savings_target', 15, 2)->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
        });

        Schema::create('budget_categories', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('budget_id');
            $table->unsignedBigInteger('category_id')->nullable();
            $table->decimal('amount_limit', 15, 2);
            $table->unique(['budget_id', 'category_id']);
        });

        Schema::create('category_budgets', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('client_id');
            $table->unsignedBigInteger('category_id');
            $table->string('month', 7);
            $table->decimal('limit_amount', 15, 2);
            $table->decimal('alert_percent', 5, 2)->default(80);
            $table->boolean('is_recurring')->default(false);
            $table->boolean('is_essential')->default(false);
            $table->timestamps();
            $table->unique(['category_id', 'month']);
            $table->index('client_id');
            $table->index('month');
        });
    }

    public function down()
    {
        Schema::dropIfExists('category_budgets');
        Schema::dropIfExists('budget_categories');
        Schema::dropIfExists('budgets');
        Schema::dropIfExists('payment_history');
        Schema::dropIfExists('recurring_payments');
        Schema::dropIfExists('settings_history');
        Schema::dropIfExists('settings');
        Schema::dropIfExists('goals');
        Schema::dropIfExists('transactions');
        Schema::dropIfExists('categories');
        Schema::dropIfExists('accounts');
    }
}
