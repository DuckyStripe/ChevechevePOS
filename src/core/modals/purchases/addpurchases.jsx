import React, { useState, useRef } from "react";
import { DatePicker } from "antd";
import { Calendar } from "feather-icons-react/build/IconComponents";
import axios from "axios";
import Cookies from "js-cookie";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const AddPurchases = () => {
  const cancelButtonRef = useRef(null);
  const [formData, setFormData] = useState({
    nombreProducto: "",
    cantidad: 0,
    precioUnitario: 0,
    fechaCompra: new Date(),
  });

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });
  };

  const handleDateChange = (date) => {
    setFormData({
      ...formData,
      fechaCompra: date.toISOString(),
    });
  };

  const validateForm = () => {
    const { nombreProducto, cantidad, precioUnitario, fechaCompra } = formData;
    const errors = [];

    if (!nombreProducto) errors.push("El nombre del producto es requerido.");
    if (cantidad <= 0 || isNaN(Number(cantidad))) {
      errors.push("La cantidad debe ser mayor que cero y numérica.");
    }
    if (precioUnitario <= 0 || isNaN(Number(precioUnitario))) {
      errors.push("El precio unitario debe ser mayor que cero y numérico.");
    }
    if (!fechaCompra) errors.push("La fecha de compra es requerida.");

    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const formattedData = {
      ...formData,
      cantidad: Number(formData.cantidad),
      precioUnitario: Number(formData.precioUnitario),
    };

    const errors = validateForm();
    if (errors.length > 0) {
      errors.forEach((error) => toast.error(error));
      return;
    }

    const token = Cookies.get("authToken");

    const config = {
      method: "post",
      url: `https://cheveposapi.codelabs.com.mx/Endpoints/Insert/InsertCompra.php`,
      headers: {
        Authorization: `Bearer ${token}`,
      },
      data: formattedData,
    };

    try {
      const response = await axios.request(config);
      if (response.data.success) {
        resetFilters();
        if (cancelButtonRef.current) {
          cancelButtonRef.current.click(); // Simula el click para cerrar el modal
        }
        toast.success("Compra guardada exitosamente.");
      } else {
        toast.error(response.data.message || "Error al guardar la compra.");
      }
    } catch (error) {
      console.error("Error al conectar con el servidor:", error);
      toast.error("Error de conexión.");
    }
  };

  const resetFilters = () => {
    setFormData({
      nombreProducto: "",
      cantidad: 0,
      precioUnitario: 0,
      fechaCompra: new Date(),
    });
  };

  return (
    <div>
      <ToastContainer />
      <div className="modal fade" id="add-units">
        <div className="modal-dialog purchase modal-dialog-centered stock-adjust-modal">
          <div className="modal-content">
            <div className="page-wrapper-new p-0">
              <div className="content">
                <div className="modal-header border-0 custom-modal-header">
                  <div className="page-title">
                    <h4>Añadir Compra</h4>
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
                  <form onSubmit={handleSubmit}>
                    <div className="row">
                      <div className="col-lg-12">
                        <div className="input-blocks">
                          <label>Nombre del Producto</label>
                          <input
                            type="text"
                            name="nombreProducto"
                            placeholder="Ingresa el nombre del producto"
                            value={formData.nombreProducto}
                            onChange={handleInputChange}
                          />
                        </div>
                      </div>
                      <div className="row">
                        <div className="col-lg-4 col-md-6 col-sm-12">
                          <div className="input-blocks">
                            <label>Cantidad</label>
                            <input
                              type="text"
                              name="cantidad"
                              value={formData.cantidad}
                              onChange={handleInputChange}
                              min="0"
                            />
                          </div>
                        </div>
                        <div className="col-lg-4 col-md-6 col-sm-12">
                          <div className="input-blocks">
                            <label>Precio Unitario</label>
                            <input
                              type="text"
                              name="precioUnitario"
                              value={formData.precioUnitario}
                              onChange={handleInputChange}
                            />
                          </div>
                        </div>
                        <div className="col-lg-4 col-md-6 col-sm-12">
                          <div className="input-blocks">
                            <label>Fecha Compra</label>
                            <div className="input-groupicon calender-input">
                              <Calendar className="info-img" />
                              <DatePicker
                                selected={new Date(formData.fechaCompra)} // Construir un nuevo Date
                                onChange={handleDateChange}
                                className="filterdatepicker"
                                dateFormat="dd-MM-yyyy"
                                placeholder="Elegir fecha"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="col-lg-12">
                      <div className="modal-footer-btn">
                        <button
                          type="button"
                          className="btn btn-cancel me-2"
                          data-bs-dismiss="modal"
                          onClick={resetFilters}
                          ref={cancelButtonRef} // Asigna la referencia al botón
                        >
                          Cancelar
                        </button>
                        <button type="submit" className="btn btn-submit">
                          Guardar
                        </button>
                      </div>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddPurchases;
