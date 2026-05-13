<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('net_worth_snapshots', function (Blueprint $table) {
            $table->id();
            $table->bigInteger('client_id');
            $table->string('month', 7); // YYYY-MM
            $table->decimal('total_balance', 15, 2)->default(0);
            $table->decimal('total_savings', 15, 2)->default(0);
            $table->decimal('total_debt', 15, 2)->default(0);
            $table->decimal('net_worth', 15, 2)->default(0);
            $table->timestamps();

            $table->foreign('client_id')->references('id')->on('users')->cascadeOnDelete();
            $table->unique(['client_id', 'month']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('net_worth_snapshots');
    }
};
