<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('audit_logs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id')->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->string('method', 10); // GET, POST, PUT, DELETE, PATCH
            $table->string('endpoint', 255);
            $table->text('payload')->nullable();
            $table->unsignedSmallInteger('status_code')->nullable();
            $table->decimal('duration_ms', 8, 2)->nullable();
            $table->timestamp('created_at');

            // Индексы для быстрого поиска
            $table->index(['user_id', 'created_at']);
            $table->index('endpoint');
            $table->index('created_at');
            $table->index('status_code');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('audit_logs');
    }
};
