<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('categorization_rule_stats', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('rule_id');
            $table->unsignedBigInteger('client_id');
            $table->unsignedBigInteger('suggested_category_id')->nullable();
            $table->unsignedBigInteger('final_category_id')->nullable();
            $table->string('suggested_income_type', 50)->nullable();
            $table->string('final_income_type', 50)->nullable();
            $table->boolean('accepted');
            $table->string('bank_merchant_name', 255)->nullable();
            $table->timestamps();

            $table->foreign('rule_id')->references('id')->on('categorization_rules')->cascadeOnDelete();
            $table->foreign('client_id')->references('id')->on('users')->cascadeOnDelete();
            $table->index(['rule_id', 'accepted']);
            $table->index(['client_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('categorization_rule_stats');
    }
};
