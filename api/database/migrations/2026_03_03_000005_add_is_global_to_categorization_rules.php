<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('categorization_rules', function (Blueprint $table) {
            $table->boolean('is_global')->default(false)->after('is_auto');
            $table->index(['is_global', 'priority']);
        });

        // Существующие глобальные правила (client_id IS NULL) помечаем как is_global = true
        \Illuminate\Support\Facades\DB::table('categorization_rules')
            ->whereNull('client_id')
            ->update(['is_global' => true]);
    }

    public function down(): void
    {
        Schema::table('categorization_rules', function (Blueprint $table) {
            $table->dropIndex(['is_global', 'priority']);
            $table->dropColumn('is_global');
        });
    }
};
