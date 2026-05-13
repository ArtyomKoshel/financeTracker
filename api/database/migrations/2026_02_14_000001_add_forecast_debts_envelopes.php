<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('recurring_payments', function (Blueprint $table) {
            $table->boolean('is_subscription')->default(false)->after('is_one_time');
            $table->date('cancel_by_date')->nullable()->after('is_subscription');
        });

        Schema::table('accounts', function (Blueprint $table) {
            $table->string('currency', 10)->default('BYN')->after('balance');
        });

        Schema::create('debts', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('client_id');
            $table->string('name');
            $table->decimal('total_amount', 15, 2);
            $table->decimal('paid_amount', 15, 2)->default(0);
            $table->string('currency', 10)->default('BYN');
            $table->date('due_date')->nullable();
            $table->decimal('monthly_payment', 15, 2)->nullable();
            $table->string('type', 20)->default('loan');
            $table->boolean('is_active')->default(true);
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->index('client_id');
        });

        Schema::create('envelopes', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('client_id');
            $table->string('name');
            $table->decimal('allocated', 15, 2)->default(0);
            $table->decimal('spent', 15, 2)->default(0);
            $table->string('month', 7);
            $table->unsignedBigInteger('category_id')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->unique(['client_id', 'name', 'month']);
            $table->index('client_id');
        });

        if (Schema::hasTable('users') && ! Schema::hasColumn('users', 'role')) {
            Schema::table('users', function (Blueprint $table) {
                $table->string('role', 20)->default('user')->after('is_admin');
            });
        }
    }

    public function down(): void
    {
        Schema::table('recurring_payments', function (Blueprint $table) {
            $table->dropColumn(['is_subscription', 'cancel_by_date']);
        });
        Schema::table('accounts', function (Blueprint $table) {
            $table->dropColumn('currency');
        });
        Schema::dropIfExists('debts');
        Schema::dropIfExists('envelopes');
        if (Schema::hasColumn('users', 'role')) {
            Schema::table('users', function (Blueprint $table) {
                $table->dropColumn('role');
            });
        }
    }
};
