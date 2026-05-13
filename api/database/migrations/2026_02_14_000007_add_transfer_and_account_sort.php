<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('accounts', function (Blueprint $table) {
            $table->integer('sort_order')->default(0)->after('name');
        });

        Schema::table('transactions', function (Blueprint $table) {
            $table->unsignedBigInteger('transfer_to_account_id')->nullable()->after('goal_id');
            $table->index('transfer_to_account_id');
        });
    }

    public function down(): void
    {
        Schema::table('accounts', function (Blueprint $table) {
            $table->dropColumn('sort_order');
        });
        Schema::table('transactions', function (Blueprint $table) {
            $table->dropIndex(['transfer_to_account_id']);
            $table->dropColumn('transfer_to_account_id');
        });
    }
};
