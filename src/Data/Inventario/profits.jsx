import { faker } from '@faker-js/faker';

// Función para generar datos financieros aleatorios para un año completo
function generateYearlyFinanceData() {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const entries = [];
    const exits = [];
    const profits = [];
    const total = [];

    // Corrige el límite del bucle utilizando months.length
    for (let i = 0; i < months.length; i++) {
        const entry = faker.number.int({ min: 5000, max: 20000 });
        const exit = faker.number.int({ min: 1000, max: 5000 });
        const profit = entry - exit;
        entries.push(entry);
        exits.push(exit);
        profits.push(profit);
        total.push(Math.abs(profit));
    }

    return {
        months: months,
        finances: {
            income: [
                { category: "Entradas", values: entries },
                { category: "Salidas", values: exits },
                { category: "Ganancia", values: profits },
                { category: "Total", values: total }
            ]
        }
    };
}

function generateMonthlyFinanceData(year, month) {
    const daysInMonth = {
        "Jan": 31, "Feb": 28, "Mar": 31, "Apr": 30,
        "May": 31, "Jun": 30, "Jul": 31, "Aug": 31,
        "Sep": 30, "Oct": 31, "Nov": 30, "Dec": 31
    };

    const days = daysInMonth[month] || 31;

    const entries = [];
    const exits = [];
    const profits = [];
    const total = [];

    for (let i = 0; i < days; i++) {
        const entry = faker.number.int({ min: 5000, max: 20000 });
        const exit = faker.number.int({ min: 1000, max: 5000 });
        const profit = entry - exit;
        entries.push(entry);
        exits.push(exit);
        profits.push(profit);
        total.push(Math.abs(profit));
    }

    return {
        months: Array.from({ length: days }, (_, i) => i + 1),
        finances: {
            income: [
                { category: "Entradas", values: entries },
                { category: "Salidas", values: exits },
                { category: "Ganancia", values: profits },
                { category: "Total", values: total }
            ]
        }
    };
}



// Exportando años y meses disponibles
export const availableYears = [
    { value: "Selecciona uno", label: "Selecciona uno" },
    { value: "2021", label: "2021" },
    { value: "2022", label: "2022" }
];
23
export const availableMonths = [
    { value: "Selecciona uno", label: "Selecciona uno" },
    { value: "Jan", label: "Jan" },
    { value: "Feb", label: "Feb" },
    { value: "Mar", label: "Mar" },
    { value: "Apr", label: "Apr" },
    { value: "May", label: "May" },
    { value: "Jun", label: "Jun" },
    { value: "Jul", label: "Jul" }
];

// Funciones simuladas para recuperar datos
export const fetchProfitsYear = async (year) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return generateYearlyFinanceData(year);
};

export const fetchProfitsMonths = async (year,month) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return generateMonthlyFinanceData(year, month);
};

export const fetchProfitsYears = async () => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return availableYears;
};

export const fetchProfitsMonthsAvailable = async (year) => {
    console.log(year)
    await new Promise((resolve) => setTimeout(resolve, 500));
    return availableMonths;
};
