<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('external_api_logs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('client_id')->nullable();
            $table->string('service', 50);
            $table->string('endpoint', 255)->nullable();
            $table->string('method', 10)->default('POST');
            $table->unsignedSmallInteger('status_code')->nullable();
            $table->unsignedInteger('duration_ms')->nullable();
            $table->text('request_meta')->nullable();
            $table->text('response_meta')->nullable();
            $table->text('error_message')->nullable();
            $table->timestamps();

            $table->index(['client_id', 'created_at']);
            $table->index('service');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('external_api_logs');
    }
};
