const fetch = require('node-fetch');

/**
 * Obtiene el país de una IP usando API gratuita
 * @param {string} ip - Dirección IP
 * @returns {Promise<string>} - Nombre del país o 'Desconocido'
 */
async function getCountryFromIP(ip) {
    // Ignorar IPs locales
    if (ip === '::1' || ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) {
        return 'Local';
    }

    try {
        const response = await fetch(`http://ip-api.com/json/${ip}?fields=country,status`);
        const data = await response.json();
        
        if (data.status === 'success' && data.country) {
            return data.country;
        }
        return 'Desconocido';
    } catch (error) {
        console.error('❌ Error en geolocalización:', error.message);
        return 'Desconocido';
    }
}

/**
 * Función para normalizar IPs (IPv6 a IPv4 cuando sea posible)
 */
function normalizeIP(ip) {
    if (ip && ip.includes('::ffff:')) {
        return ip.replace('::ffff:', '');
    }
    return ip;
}

module.exports = { getCountryFromIP, normalizeIP };