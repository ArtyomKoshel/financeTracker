<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('recurring_payments', function (Blueprint $table) {
            $table->boolean('is_auto_debit')->default(false)->after('is_subscription');
        });
    }

    public function down(): void
    {
        Schema::table('recurring_payments', function (Blueprint $table) {
            $table->dropColumn('is_auto_debit');
        });
    }
};
