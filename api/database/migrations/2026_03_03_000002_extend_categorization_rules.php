<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('categorization_rules', function (Blueprint $table) {
            $table->string('name', 255)->nullable()->after('client_id');
            $table->json('conditions')->nullable()->after('merchant_pattern');
            $table->string('result_income_type', 50)->nullable()->after('category_id');
            $table->boolean('is_auto')->default(true)->after('result_income_type');
            $table->integer('priority')->default(0)->after('is_auto');
            $table->bigInteger('times_applied')->default(0)->after('priority');
        });
    }

    public function down(): void
    {
        Schema::table('categorization_rules', function (Blueprint $table) {
            $table->dropColumn(['name', 'conditions', 'result_income_type', 'is_auto', 'priority', 'times_applied']);
        });
    }
};
