const Clientes = [
  { value: "walkInCustomer", label: "Walk in Customer" },
  { value: "john", label: "John" },
  { value: "smith", label: "Smith" },
  { value: "ana", label: "Ana" },
  { value: "elza", label: "Elza" }
];
const products = [
  { value: "walkInCustomer", label: "Walk in Customer" },
  { value: "john", label: "John" },
  { value: "smith", label: "Smith" },
  { value: "ana", label: "Ana" },
  { value: "elza", label: "Elza" }
];
  export const fetchCustomerData = async () => {
    // Aquí puedes simular una espera similar a una llamada a la API
    await new Promise((r) => setTimeout(r, 500)); // Simula un retraso de 500ms
    return Clientes;
  };
  export const fetchProductData = async () => {
    // Aquí puedes simular una espera similar a una llamada a la API
    await new Promise((r) => setTimeout(r, 500)); // Simula un retraso de 500ms
    return products;
  };