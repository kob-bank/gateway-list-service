// Test timezone conversion
const now = new Date();
console.log('System time:', now.toISOString());
console.log('System local:', now.toString());

const bangkokTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
console.log('Bangkok time:', bangkokTime.toString());
console.log('Bangkok hours:', bangkokTime.getHours());
console.log('Bangkok minutes:', bangkokTime.getMinutes());

const currentTime = bangkokTime.getHours() * 60 + bangkokTime.getMinutes();
console.log('Current time in minutes:', currentTime);

// suzakupay time range: 02:00 - 22:50
const startTime = 2 * 60 + 0;  // 120
const endTime = 22 * 60 + 50;  // 1370

console.log('\nsuzakupay range: 02:00-22:50');
console.log('Start time (minutes):', startTime);
console.log('End time (minutes):', endTime);
console.log('In range?', currentTime >= startTime && currentTime <= endTime);
