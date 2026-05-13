<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('categorization_rules', function (Blueprint $table) {
            $table->id();
            $table->bigInteger('client_id');
            $table->string('merchant_pattern', 255);
            $table->bigInteger('category_id');
            $table->integer('confidence')->default(1);
            $table->timestamp('last_used_at')->nullable();
            $table->timestamps();

            $table->foreign('client_id')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('category_id')->references('id')->on('categories')->cascadeOnDelete();
            $table->index(['client_id', 'confidence']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('categorization_rules');
    }
};
