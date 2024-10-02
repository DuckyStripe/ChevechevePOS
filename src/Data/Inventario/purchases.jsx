export const mockSales = [
  {
    id: 1,
    datepurchase: "2024-10-01", // Fecha de Venta
    Name: "Compra de Monitores", // Cantidad Vendida
    Cantidad: "$10.00", // Precio Unitario
    total: "$100.00", // Total de la Venta, calculado en el backend
    createdby: "Juan Pérez", // Vendedor Responsable
  },
  {
    id: 2,
    datepurchase: "2024-10-02",
    Name: "Compra de Monitores",
    Cantidad: "$12.00",
    total: "$180.00",
    createdby: "Ana Gómez",
  },
  {
    id: 3,
    datepurchase: "2024-10-03",
    Name: "Compra de Monitores",
    Cantidad: "$8.00",
    total: "$40.00",
    createdby: "Carlos López",
  },
  {
    id: 4,
    datepurchase: "2024-10-04",
    Name: "Compra de Monitores",
    Cantidad: "$11.00",
    total: "$77.00",
    createdby: "Luis Martínez",
  },
  {
    id: 5,
    datepurchase: "2024-10-05",
    Name: "Compra de Monitores",
    Cantidad: "$13.00",
    total: "$78.00",
    createdby: "María Fernández",
  },
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
