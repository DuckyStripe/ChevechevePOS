import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
// Asegúrate de que ImageWithBasePath esté importado correctamente, y cualquier otra dependencia necesaria esté disponible.

const EditCustomer = ({ CustomerData }) => {
  const [formData, setFormData] = useState({
    id: "",
    CustomerName: "",
    CustomerEmail: "",
    CustomerPhone: "",
    CustomerAddress: "",
  });

  const [formErrors, setFormErrors] = useState({});

  useEffect(() => {
    if (CustomerData) {
      setFormData({
        id: CustomerData.id || "",
        CustomerName: CustomerData.CustomerName || "",
        CustomerEmail: CustomerData.CustomerEmail || "",
        CustomerPhone: CustomerData.CustomerPhone || "",
        CustomerAddress: CustomerData.CustomerAddress || "",
      });
    }
  }, [CustomerData]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const validateForm = () => {
    const errors = {};

    if (!formData.CustomerName) {
      errors.CustomerName = "El nombre es obligatorio.";
    }
    if (!formData.CustomerEmail) {
      errors.CustomerEmail = "El correo es obligatorio.";
    } else if (!/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(formData.CustomerEmail)) {
      errors.CustomerEmail = "El correo no es válido.";
    }
    if (!formData.CustomerPhone) {
      errors.CustomerPhone = "El teléfono es obligatorio.";
    } else if (!/^\d+$/.test(formData.CustomerPhone)) {
      errors.CustomerPhone = "El teléfono solo debe contener números.";
    }
    if (!formData.CustomerAddress) {
      errors.CustomerAddress = "La dirección es obligatoria.";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (validateForm()) {
      try {
        console.log("Enviando datos: ", formData);
        toast.success("Cliente modificado exitosamente");

        // Resetea el formulario después de enviar
        // setFormData({
        //   id: "",
        //   CustomerName: "",
        //   CustomerEmail: "",
        //   CustomerPhone: "",
        //   CustomerAddress: "",
        // });

        // Simula un clic en el botón de cancelar para cerrar el modal
        document.querySelector(".btn-cancel").click();
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
                            className={`form-control ${formErrors.CustomerName ? "is-invalid" : ""}`}
                            name="CustomerName"
                            value={formData.CustomerName}
                            onChange={handleInputChange}
                          />
                          {formErrors.CustomerName && (
                            <div className="invalid-feedback">{formErrors.CustomerName}</div>
                           
                          )}
                        </div>
                      </div>
                      <div className="col-lg-4 pe-0">
                        <div className="mb-3">
                          <label className="form-label">Email</label>
                          <input
                            type="email"
                            className={`form-control ${formErrors.CustomerEmail ? "is-invalid" : ""}`}
                            name="CustomerEmail"
                            value={formData.CustomerEmail}
                            onChange={handleInputChange}
                          />
                          {formErrors.CustomerEmail && (
                            <div className="invalid-feedback">{formErrors.CustomerEmail}</div>
                          )}
                        </div>
                      </div>
                      <div className="col-lg-4 pe-0">
                        <div className="mb-3">
                          <label className="form-label">Phone</label>
                          <input
                            type="text"
                            className={`form-control ${formErrors.CustomerPhone ? "is-invalid" : ""}`}
                            name="CustomerPhone"
                            value={formData.CustomerPhone}
                            onChange={handleInputChange}
                          />
                          {formErrors.CustomerPhone && (
                            <div className="invalid-feedback">{formErrors.CustomerPhone}</div>
                          )}
                        </div>
                      </div>
                      <div className="col-lg-12 pe-0">
                        <div className="mb-3">
                          <label className="form-label">Address</label>
                          <input
                            type="text"
                            className={`form-control ${formErrors.CustomerAddress ? "is-invalid" : ""}`}
                            name="CustomerAddress"
                            value={formData.CustomerAddress}
                            onChange={handleInputChange}
                          />
                          {formErrors.CustomerAddress && (
                            <div className="invalid-feedback">{formErrors.CustomerAddress}</div>
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
                      <button type="submit" className="btn btn-submit" data-bs-dismiss="modal" >
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
    CustomerName: PropTypes.string.isRequired,
    CustomerEmail: PropTypes.string.isRequired,
    CustomerPhone: PropTypes.string.isRequired,
    CustomerAddress: PropTypes.string.isRequired,
  }),
};

export default EditCustomer;
