<?php

use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Web Routes
|--------------------------------------------------------------------------
|
| Here is where you can register web routes for your application. These
| routes are loaded by the RouteServiceProvider within a group which
| contains the "web" middleware group. Now create something great!
|
*/

// SPA entry points — serve built frontend from api/public/static/dist/
Route::get('/', fn () => response()->file(public_path('static/dist/index.html')));
Route::get('/admin', fn () => response()->file(public_path('static/dist/admin.html')));
Route::get('/admin.html', fn () => response()->file(public_path('static/dist/admin.html')));
Route::get('/login.html', fn () => response()->file(public_path('static/dist/login.html')));

// PWA (fallback to public/ if dist not built yet)
Route::get('/manifest.json', function () {
    $path = file_exists(public_path('static/dist/manifest.json'))
        ? public_path('static/dist/manifest.json')
        : public_path('manifest.json');

    return file_exists($path)
        ? response()->file($path)->header('Content-Type', 'application/manifest+json')
        : response('', 404);
});
Route::get('/sw.js', function () {
    $path = file_exists(public_path('static/dist/sw.js'))
        ? public_path('static/dist/sw.js')
        : public_path('sw.js');

    return file_exists($path)
        ? response()->file($path)->header('Content-Type', 'application/javascript')
        : response('', 404);
});
