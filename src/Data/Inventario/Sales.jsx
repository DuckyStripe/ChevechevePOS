export const mockSales = [
  {
    id: 1,
    ticket: "0001", // Número de Ticket
    datesale: "2024-10-01", // Fecha de Venta
    qty: 10, // Cantidad Vendida
    price: "$10.00", // Precio Unitario
    total: "$100.00", // Total de la Venta, calculado en el backend
    createdby: "Juan Pérez", // Vendedor Responsable
  },
  {
    id: 2,
    ticket: "0002",
    datesale: "2024-10-02",
    qty: 15,
    price: "$12.00",
    total: "$180.00",
    createdby: "Ana Gómez",
  },
  {
    id: 3,
    ticket: "0003",
    datesale: "2024-10-03",
    qty: 5,
    price: "$8.00",
    total: "$40.00",
    createdby: "Carlos López",
  },
  {
    id: 4,
    ticket: "0004",
    datesale: "2024-10-04",
    qty: 7,
    price: "$11.00",
    total: "$77.00",
    createdby: "Luis Martínez",
  },
  {
    id: 5,
    ticket: "0005",
    datesale: "2024-10-05",
    qty: 6,
    price: "$13.00",
    total: "$78.00",
    createdby: "María Fernández",
  },
];

export const fetchSales = async () => {
  // Simula un retardo de red con una promesa
  await new Promise((resolve) => setTimeout(resolve, 500));
  return mockSales;
};

const createOptions = (items, key) => {
  const uniqueItems = [...new Set(items.map(item => item[key]))];
  return uniqueItems.map(item => ({ value: item.toLowerCase(), label: item }));
}

export const fetchSalesOptions = async () => {
  // Simula un retardo de red con una promesa
  await new Promise((resolve) => setTimeout(resolve, 500));

  const options = {
    tickets: createOptions(mockSales, 'ticket'),
    dates: createOptions(mockSales, 'datesale'),
    createdBys: createOptions(mockSales, 'createdby'),
  };

  return options;
};
