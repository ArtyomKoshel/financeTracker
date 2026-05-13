<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('income_types', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('client_id');
            $table->string('code', 50);
            $table->string('label');
            $table->string('icon', 10)->nullable();
            $table->string('default_currency', 10)->default('BYN');
            $table->integer('sort_order')->default(0);
            $table->boolean('is_salary_related')->default(false);
            $table->timestamps();
            $table->unique(['client_id', 'code']);
            $table->index('client_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('income_types');
    }
};
