'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('screenshots directory exists', () => {
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'screenshots')));
});

test('ribbon.png exists', () => {
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'screenshots', 'ribbon.png')));
});

test('sidebar.png exists', () => {
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'screenshots', 'sidebar.png')));
});

test('result.png exists', () => {
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'screenshots', 'result.png')));
});
