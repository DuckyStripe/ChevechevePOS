export const mockSales = [
  {
    id: 1,
    datepurchase: "2024-10-01", // Fecha de Venta
    Name: "Compra de Monitores", // Cantidad Vendida
    Cantidad: "$10.00", // Precio Unitario
    total: "$100.00", // Total de la Venta, calculado en el backend
    createdby: "Juan Pérez", // Vendedor Responsable
  }
];

export const fetchPurchases = async () => {
  // Simula un retardo de red con una promesa
  await new Promise((resolve) => setTimeout(resolve, 500));
  return mockSales;
};

const createOptions = (items, key) => {
  const uniqueItems = [...new Set(items.map(item => item[key]))];
  return uniqueItems.map(item => ({ value: item.toLowerCase(), label: item }));
}

export const fetchPurchasesOptions = async () => {
  // Simula un retardo de red con una promesa
  await new Promise((resolve) => setTimeout(resolve, 500));

  const options = {
    tickets: createOptions(mockSales, 'ticket'),
    dates: createOptions(mockSales, 'datepurchase'),
    createdBys: createOptions(mockSales, 'createdby'),
  };

  return options;
};
