'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../luci-app-forkop-analyzer/htdocs/luci-static/resources/forkop-analyzer/monitor-v3.js'), 'utf8');
const monitor = new Function('baseclass', 'dom', '_', source)({ extend: value => value }, {}, text => text);
function sample(at, tag, state = 'up', selector = 'vpn-out') {
	return { at, tag, name: tag, selector, state, latency_ms: state === 'up' ? 100 + at % 70 : null, interval: 15 };
}
function model(samples, now = 200, hours = 1) {
	return monitor.buildModel({ samples, interval: 15 }, 'vpn-out', hours, now);
}
let m = model([sample(100, 'A'), sample(115, 'A', 'down'), sample(130, 'A', 'down'), sample(145, 'B'), sample(160, 'B')], 175);
assert.equal(m.total.losses, 1, 'repeated failures form one outage');
assert.equal(m.total.failed, 2);
assert.equal(m.total.switches, 1);
assert.equal(m.total.down, 30);
assert.deepEqual(m.segments.map(s => s.tag), ['A', 'B']);
assert.equal(m.rows.find(r => r.tag === 'B').switches, 1);
m = model([sample(100, 'A'), sample(115, 'B')], 130);
assert.equal(m.total.losses, 0, 'switch without failure is not a loss');
assert.equal(m.total.switches, 1);
m = model([sample(100, 'A'), sample(115, '', 'unknown'), sample(130, 'B')], 145);
assert.equal(m.total.losses, 0, 'API outage is not VPN loss');
assert.equal(m.total.switches, 0, 'unknown route does not fabricate a transition');
assert.equal(m.total.unknown, 15);
m = model([sample(100, 'A'), sample(200, 'A')], 215);
assert.equal(m.segments.length, 2, 'do not bridge collection gaps');
assert.equal(m.total.up, 50);
assert.equal(m.total.unknown, 65);
m = model([sample(100, 'A'), sample(115, 'B', 'up', 'other'), sample(130, 'A')], 145);
assert.equal(m.segments.length, 2, 'switching monitored groups breaks continuity');
assert.equal(m.total.switches, 0);
m = model([sample(100, 'A', 'down'), sample(115, 'A', 'down'), sample(130, 'A')], 150, 40 / 3600);
assert.equal(m.total.losses, 0, 'ongoing outage entering selected window is not new');
assert.equal(m.total.down, 20);
m = model([sample(100, 'A')], 200);
assert.equal(m.total.up, 35, 'stopped collector cannot imply continued uptime');
assert.equal(m.total.unknown, 65);
m = model([sample(100, '__proto__'), sample(115, 'constructor')], 130);
assert.equal(m.rows.length, 2, 'server names cannot alter object prototypes');
assert.notEqual(monitor.color('A'), monitor.color('I'), 'colliding hashes still use different colors');
assert.equal(monitor.color('A'), monitor.color('A'), 'stable color during refresh');
assert.equal(model([]).segments.length, 0);
const packed = { format: 'compact-v1', routes: [{selector:'vpn-out',tag:'A',name:'Server A'}], samples:[[100,0,'up',124,15,''],[115,0,'down',null,15,'probe_failed']] };
m = monitor.buildModel(packed, 'vpn-out', 1, 130);
assert.equal(m.rows[0].name, 'Server A');
assert.equal(m.total.losses, 1);
assert.equal(m.total.down, 15);
const fullDay = {...packed,samples:Array.from({length:8641},(_,i)=>[i*10,0,'up',124,10,''])};
assert.ok(Buffer.byteLength(JSON.stringify(fullDay)) < 512*1024, 'compact full-day response stays below ubus message budget');

// Подписка может переиспользовать runtime tag для сервера с другим названием.
const replacement = [
	{...sample(100, 'vpn-1-out'), name: 'Netherlands', latency_ms: 100},
	{...sample(115, 'vpn-1-out'), name: 'Netherlands', latency_ms: 120},
	{...sample(130, 'vpn-1-out'), name: 'Germany', latency_ms: 240},
	{...sample(145, 'vpn-1-out'), name: 'Netherlands', latency_ms: 140}
];
m = model(replacement, 160);
assert.equal(m.rows.length, 2, 'replacement under the same tag gets its own statistics');
const nl = m.rows.find(r => r.name === 'Netherlands');
const de = m.rows.find(r => r.name === 'Germany');
assert.equal(nl.checks, 3, 'returning to previous server keeps its own history');
assert.equal(nl.latency / nl.successes, 120);
assert.equal(de.checks, 1);
assert.equal(de.latency / de.successes, 240);
assert.equal(m.total.switches, 2, 'name replacement under the same tag is a transition');
assert.deepEqual(m.segments.map(s => s.name), ['Netherlands', 'Germany', 'Netherlands']);
assert.notEqual(monitor.color(nl.key), monitor.color(de.key), 'different identities have different graph colors');
m = model(replacement.slice(0, 3).map(s => ({...s, state:'down', latency_ms:null})), 145);
assert.equal(m.total.losses, 2, 'outages on replacement servers are separate episodes');
const reusedTag = {format:'compact-v1', routes:[
	{selector:'vpn-out',tag:'vpn-1-out',name:'Netherlands'},
	{selector:'vpn-out',tag:'vpn-1-out',name:'Germany'}
], samples:[[100,0,'up',100,15,''],[115,1,'up',240,15,'']]};
m = monitor.buildModel(reusedTag, 'vpn-out', 1, 130);
assert.deepEqual(m.rows.map(r => [r.name,r.checks]), [['Netherlands',1],['Germany',1]], 'compact routes retain historical identities');
console.log('Monitor graph, outage, switch and server identity tests passed.');
