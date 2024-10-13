import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
// import { all_routes } from "../../../Router/all_routes";
import PropTypes from "prop-types";
import { ToastContainer, toast } from "react-toastify";
import axios from "axios";
import Cookies from "js-cookie";

const AddInventory = ({ DataProducto }) => {
  const [quantity, setQuantity] = useState("");
  const [operation, setOperation] = useState("add"); // Estado para manejar si se agrega o se quita inventario
  const [productData, setProductData] = useState({
    id: 0,
    nombre_producto: "",
    Categoria: 0,
    Subcategoria: 0,
    Unidad: 0,
    precio_compra: "",
    precio_venta: "",
    cantidad: 0,
    cantidadMinima: 0,
    imagen_producto: "",
    creado_en: "",
    FechaActualizacion: "",
  });

  // const route = all_routes;
  useEffect(() => {
    // Asegúrate de que DataProducto esté definido y existe antes de la conversión
    if (DataProducto) {
      // Actualiza productData con valores numéricos para precio_compra y precio_venta
      setProductData({
        ...DataProducto,
        precio_compra: parseFloat(DataProducto.precio_compra) || 0, // Convierte a número
        precio_venta: parseFloat(DataProducto.precio_venta) || 0,   // Convierte a número
      });
    }
    console.log(DataProducto)
  }, [DataProducto]); // Volver a ejecutar si DataProducto cambia
  const handleQuantityChange = (e) => {
    setQuantity(e.target.value);
  };

  const handleOperationChange = (e) => {
    setOperation(e.target.value);
  };
  const validateFormData = () => {
    const errors = {};

    // Validación para cantidades: solo números
    if (!quantity || quantity === "" || quantity == null || quantity == 0) {
      errors.cantidad = "La cantidad actual es requerida.";
    } else if (!/^\d+$/.test(quantity)) {
      errors.cantidad = "La cantidad actual debe ser un número.";
    }

    // Validación para restar menos del inventario disponible
    if (operation === "remove" && parseInt(quantity) > productData.cantidad) {
      errors.cantidadExcedida = "No puedes restar más de la cantidad disponible.";
    }

    return errors;
  };


  const handleSubmit =async () => {
    const errors = validateFormData();

    if (Object.keys(errors).length > 0) {
      Object.values(errors).forEach((error) => {
        toast.error(error);
      });
      return;
    }
    const token = Cookies.get("authToken");

    const formData = new FormData();
    formData.append("productId", productData.id);
    formData.append("operation", operation);
    formData.append("quantity", quantity);
    const config = {
      method: "post",
      url: "https://cheveposapi.codelabs.com.mx/Endpoints/Update/add2inventory.php",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      data: formData,
    };

    try {
      const response = await axios.request(config);

      if (response.data.success) {
        toast.success("Producto actualizao correctamente.");
        // Limpiar o redirigir según sea necesario
        window.location.reload();
      } else {
        toast.error(`Error: ${response.data.message}`);
      }
    } catch (error) {
      toast.error(`Error: ${error.message}`);
    }
  };
  const closemodal = () => {
    setProductData({
      nombre: "",
      unidad: null,
      categoria: null,
      subcategoria: null,
      precioCosto: "",
      precioVenta: "",
      precioMayoreo: "",
      cantidadActual: "",
      cantidadMinima: "",
      imagen: null,
    });
    setQuantity("")
    setOperation("add");
  };

  return (
    <>
    <ToastContainer/>
      {/* Add or Remove Inventory */}
      <div className="modal fade" id="add-units-category">
        <div className="modal-dialog modal-dialog-centered custom-modal-two">
          <div className="modal-content">
            <div className="page-wrapper-new p-0">
              <div className="content">
                <div className="modal-header border-0 custom-modal-header">
                  <div className="page-title">
                    <h4>Añadir o Quitar Inventario</h4>
                  </div>
                  <button
                    type="button"
                    className="close"
                    data-bs-dismiss="modal"
                    aria-label="Close"
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </div>
                <div className="modal-body custom-modal-body">
                <div className="mb-3">
                    <label className="form-label">Poducto</label>
                    <input
                      type="Text"
                      disabled={true}
                      className="form-control"
                      value={productData.nombre_producto || ""}
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Cantidad</label>
                    <input
                      type="number"
                      className="form-control"
                      value={quantity}
                      onChange={handleQuantityChange}
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Operación</label>
                    <select
                      className="form-control"
                      value={operation}
                      onChange={handleOperationChange}
                    >
                      <option value="add">Añadir</option>
                      <option value="remove">Quitar</option>
                    </select>
                  </div>
                  <div className="modal-footer-btn">
                    <Link
                      to="#"
                      className="btn btn-cancel me-2"
                      data-bs-dismiss="modal"
                      onClick={closemodal}
                    >
                      Cancelar
                    </Link>
                    <button
                      className="btn btn-submit"
                      onClick={handleSubmit}
                      data-bs-dismiss="modal"
                    >
                      Enviar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* /Add or Remove Inventory */}
    </>
  );
};
AddInventory.propTypes = {
  DataProducto: PropTypes.shape({
    id: PropTypes.number.isRequired,
    nombre_producto: PropTypes.string.isRequired,
    Categoria: PropTypes.number.isRequired,
    Subcategoria: PropTypes.number.isRequired,
    Unidad: PropTypes.number.isRequired,
    precio_compra: PropTypes.string.isRequired,
    precio_venta: PropTypes.string.isRequired,
    cantidad: PropTypes.number.isRequired,
    cantidadMinima: PropTypes.number.isRequired,
    imagen_producto: PropTypes.string.isRequired,
    creado_en: PropTypes.string.isRequired,
    FechaActualizacion: PropTypes.string.isRequired,
  }),
};
export default AddInventory;
