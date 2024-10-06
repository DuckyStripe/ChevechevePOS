export const mockSales = [
  {
    id: 1,
    ticket: "0001", // Número de Ticket
    datesale: "2024-10-01", // Fecha de Venta
    qty: 10, // Cantidad Vendida
    price: "$10.00", // Precio Unitario
    total: "$100.00", // Total de la Venta, calculado en el backend
    createdby: "Juan Pérez", // Vendedor Responsable
  }
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
