<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('push_subscriptions', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id');
            $table->string('endpoint', 500);
            $table->string('p256dh', 255)->nullable();
            $table->string('auth', 255)->nullable();
            $table->string('user_agent', 500)->nullable();
            $table->timestamps();
            $table->unique(['user_id', 'endpoint']);
            $table->index('user_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('push_subscriptions');
    }
};
