<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('notes', function (Blueprint $table) {
            $table->json('action_items')->nullable()->after('summary');
            $table->json('suggested_labels')->nullable()->after('action_items');
            $table->timestamp('analyzed_at')->nullable()->after('suggested_labels');
        });
    }

    public function down(): void
    {
        Schema::table('notes', function (Blueprint $table) {
            $table->dropColumn(['action_items', 'suggested_labels', 'analyzed_at']);
        });
    }
};
