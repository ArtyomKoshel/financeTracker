<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('note_label', function (Blueprint $table) {
            $table->unsignedBigInteger('note_id');
            $table->unsignedBigInteger('label_id');

            $table->primary(['note_id', 'label_id']);

            $table->foreign('note_id')->references('id')->on('notes')->onDelete('cascade');
            $table->foreign('label_id')->references('id')->on('note_labels')->onDelete('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('note_label');
    }
};
