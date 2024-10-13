import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import axios from "axios";
import Cookies from "js-cookie";

const EditCustomer = ({ CustomerData }) => {
  const [formData, setFormData] = useState({
    id: "",
    nombre: "",
    correo: "",
    telefono: "",
    direccion: "",
  });

  const [formErrors, setFormErrors] = useState({});

  useEffect(() => {
    if (CustomerData) {
      setFormData({
        id: CustomerData.id || "",
        nombre: CustomerData.nombre || "",
        correo: CustomerData.correo || "",
        telefono: CustomerData.telefono || "",
        direccion: CustomerData.direccion || "",
      });
    }
  }, [CustomerData]);
  useEffect(() => {
    console.log("Current formData:", formData);
  }, [formData]);
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const validateForm = () => {
    const errors = {};

    if (!formData.nombre) {
      errors.nombre = "El nombre es obligatorio.";
    }
    if (!formData.correo) {
      errors.correo = "El correo es obligatorio.";
    } else if (
      !/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(formData.correo)
    ) {
      errors.correo = "El correo no es válido.";
    }
    if (!formData.telefono) {
      errors.telefono = "El teléfono es obligatorio.";
    } else if (!/^\d+$/.test(formData.telefono)) {
      errors.telefono = "El teléfono solo debe contener números.";
    }
    if (!formData.direccion) {
      errors.direccion = "La dirección es obligatoria.";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (validateForm()) {
      try {
        const token = Cookies.get("authToken");
        const formDataToSend = new FormData();
        formDataToSend.append("idCliente", formData.id);
        formDataToSend.append("nombre", formData.nombre);
        formDataToSend.append("correo", formData.correo);
        formDataToSend.append("telefono", formData.telefono);
        formDataToSend.append("direccion", formData.direccion);
        const config = {
          method: "post",
          url: "https://cheveposapi.codelabs.com.mx/Endpoints/Update/updateCliente.php",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          data: formDataToSend,
        };
        try {
          const response = await axios.request(config);

          if (response.data.success) {
            toast.success("Cliente actualizado correctamente.");
            // Limpiar o redirigir según sea necesario
            window.location.reload();
          } else {
            toast.error(`Error: ${response.data.message}`);
          }
        } catch (error) {
          toast.error(`Error: ${error.message}`);
        }
      } catch (error) {
        console.error("Error al enviar datos: ", error);
        toast.error("Error al modificar el cliente");
      }
    }
  };

  return (
    <>
      <ToastContainer />
      {/* Edit Customer */}
      <div className="modal fade" id="edit-units">
        <div className="modal-dialog modal-dialog-centered custom-modal-two">
          <div className="modal-content">
            <div className="page-wrapper-new p-0">
              <div className="content">
                <div className="modal-header border-0 custom-modal-header">
                  <div className="page-title">
                    <h4>Edit Customer</h4>
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
                      <div className="col-lg-4 pe-0">
                        <div className="mb-3">
                          <label className="form-label">Customer Name</label>
                          <input
                            type="text"
                            className={`form-control ${
                              formErrors.nombre ? "is-invalid" : ""
                            }`}
                            name="nombre"
                            value={formData.nombre}
                            onChange={handleInputChange}
                          />
                          {formErrors.nombre && (
                            <div className="invalid-feedback">
                              {formErrors.nombre}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="col-lg-4 pe-0">
                        <div className="mb-3">
                          <label className="form-label">Email</label>
                          <input
                            type="email"
                            className={`form-control ${
                              formErrors.correo ? "is-invalid" : ""
                            }`}
                            name="correo"
                            value={formData.correo}
                            onChange={handleInputChange}
                          />
                          {formErrors.correo && (
                            <div className="invalid-feedback">
                              {formErrors.correo}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="col-lg-4 pe-0">
                        <div className="mb-3">
                          <label className="form-label">Phone</label>
                          <input
                            type="text"
                            className={`form-control ${
                              formErrors.telefono ? "is-invalid" : ""
                            }`}
                            name="telefono"
                            value={formData.telefono}
                            onChange={handleInputChange}
                          />
                          {formErrors.telefono && (
                            <div className="invalid-feedback">
                              {formErrors.telefono}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="col-lg-12 pe-0">
                        <div className="mb-3">
                          <label className="form-label">Address</label>
                          <input
                            type="text"
                            className={`form-control ${
                              formErrors.direccion ? "is-invalid" : ""
                            }`}
                            name="direccion"
                            value={formData.direccion}
                            onChange={handleInputChange}
                          />
                          {formErrors.direccion && (
                            <div className="invalid-feedback">
                              {formErrors.direccion}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="modal-footer-btn">
                      <button
                        type="button"
                        className="btn btn-cancel me-2"
                        data-bs-dismiss="modal"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className="btn btn-submit"
                        data-bs-dismiss="modal"
                      >
                        Guardar
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* /Edit Customer */}
    </>
  );
};

EditCustomer.propTypes = {
  CustomerData: PropTypes.shape({
    id: PropTypes.number.isRequired,
    nombre: PropTypes.string.isRequired,
    correo: PropTypes.string.isRequired,
    telefono: PropTypes.string.isRequired,
    direccion: PropTypes.string.isRequired,
  }),
};

export default EditCustomer;
