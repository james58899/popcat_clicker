'use strict';

import fetch from 'node-fetch';
import https from 'https';
import { networkInterfaces } from 'os';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { MeterProvider } from '@opentelemetry/metrics';

const ips = networkInterfaces().ens32.filter(i => i.family === "IPv6").map(i => i.address);

// Exporter
const meter = new MeterProvider({ exporter: new PrometheusExporter({ prefix: "popcat" }), interval: 1000, }).getMeter('prometheus')
const requestCounter = meter.createCounter('request', { description: 'Request counter with status.' })
const successCounter = requestCounter.bind({ status: "success" })
const popCounter = meter.createCounter('pop', { description: 'Pop pop pop.' })
const connectionCounter = meter.createUpDownCounter('connection', { description: 'Open connections.' })

// Logger
let rate = 0
setInterval(() => {
    console.log(`Rate: ${(rate / 1000).toFixed(1)}k`)
    rate = 0
}, 1000)

// Core
let waiting = 0

for await (const ip of ips) {
    console.log(`Creating ${ip}`)
    waiting++
    connectionCounter.add(1, { status: "init" })

    const httpsAgent = new https.Agent({
        keepAlive: true,
        localAddress: ip,
        family: "6"
    });
    let token = ""
    let ready = false

    setImmediate(async () => {
        while (true) {
            try {
                const random = 500 + Math.round(300 * Math.random())
                const captcha = await fetch('https://recaptcha.net/recaptcha/api2/anchor?ar=1&k=6Ledv1IaAAAAAKFJSR7VKPE8e-4kht4ZmLzencES&co=aHR0cHM6Ly9wb3BjYXQuY2xpY2s6NDQz&hl=zh-TW&v=JF4U2g-hvLrBJ_UxdbKj92gN&size=invisible', { agent: httpsAgent })
                    .then(res => res.text())
                    .then(text => text.match(/<input type="hidden" id="recaptcha-token" value="([^"]+)">/)[1])
                const url = `https://stats.popcat.click/pop?pop_count=${random}&captcha_token=${captcha}`
                const res = await fetch(token === "" ? url : `${url}&token=${token}`, {
                    headers: {
                        "Host": "stats.popcat.click",
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:93.0) Gecko/20100101 Firefox/93.0"
                    },
                    method: 'POST',
                    agent: httpsAgent
                })
                if (res.ok) {
                    const newToken = (await res.json()).Token
                    if (newToken) token = newToken
                    if (!ready) {
                        ready = true
                        waiting--
                        connectionCounter.add(-1, { status: "init" })
                        connectionCounter.add(1, { status: "pop" })
                    }
                    rate += random
                    successCounter.add(1)
                    popCounter.add(random)
                    // console.log(ip.split(":").slice(-1)[0] + " 的台灣價值 +1")
                } else {
                    requestCounter.add(1, { status: "fail", code: res.status.toString() })
                    if (res.status !== 503) console.log(await res.text())
                }
            } catch (error) {
                requestCounter.add(1, { status: "fail", code: "0" })
                console.error("request error.", error)
            }

            await new Promise(res => setTimeout(() => res(), 30 * 1000))
        }
    })

    // sleep 100ms
    await new Promise(resolve => {
        const timer = setInterval(() => {
            if (waiting < 30) {
                clearInterval(timer)
                resolve()
            }
        }, 100)
    });
}
