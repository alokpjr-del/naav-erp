function getNAAVWeekRange(inputDate) {
    let d;
    if (!inputDate) {
        d = new Date();
    } else if (typeof inputDate === 'string') {
        const norm = inputDate.trim();
        const parts = norm.split('-');
        if (parts.length === 3 && parts[0].length === 4) {
            d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        } else {
            d = new Date(inputDate);
        }
    } else {
        d = new Date(inputDate);
    }

    if (isNaN(d.getTime())) {
        d = new Date();
    }

    const day = d.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;

    const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diffToMonday);
    const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
    const followingMonday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 7);

    const formatDateStr = (dateObj) => {
        const yyyy = dateObj.getFullYear();
        const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
        const dd = String(dateObj.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    };

    const formatDisplayDate = (dateObj) => {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const dd = String(dateObj.getDate()).padStart(2, '0');
        const mmm = months[dateObj.getMonth()];
        const yyyy = dateObj.getFullYear();
        return `${dd}-${mmm}-${yyyy}`;
    };

    return {
        startDate: formatDateStr(monday),
        endDate: formatDateStr(sunday),
        settlementDate: formatDateStr(followingMonday),
        formattedStartDate: formatDisplayDate(monday),
        formattedEndDate: formatDisplayDate(sunday),
        formattedSettlementDate: formatDisplayDate(followingMonday),
        formattedPeriod: `${formatDisplayDate(monday)} → ${formatDisplayDate(sunday)}`
    };
}

console.log('=== TEST 1: Monday 10-Aug-2026 ===');
console.log(getNAAVWeekRange('2026-08-10'));

console.log('\n=== TEST 2: Tuesday 11-Aug-2026 ===');
console.log(getNAAVWeekRange('2026-08-11'));

console.log('\n=== TEST 3: Saturday 15-Aug-2026 ===');
console.log(getNAAVWeekRange('2026-08-15'));

console.log('\n=== TEST 4: Sunday 16-Aug-2026 ===');
console.log(getNAAVWeekRange('2026-08-16'));

console.log('\n=== TEST 5: Monday 17-Aug-2026 ===');
console.log(getNAAVWeekRange('2026-08-17'));
