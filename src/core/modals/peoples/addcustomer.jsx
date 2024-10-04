import React, { useState } from "react";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const AddCustomer = () => {
  const [formData, setFormData] = useState({
    customerName: "",
    email: "",
    phone: "",
    address: "",
  });

  const [formErrors, setFormErrors] = useState({});

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const validateForm = () => {
    const errors = {};
    if (!formData.customerName) {
      errors.customerName = "El nombre es obligatorio.";
    }
    if (!formData.email) {
      errors.email = "El correo es obligatorio.";
    } else if (!/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(formData.email)) {
      errors.email = "El correo no es válido.";
    }
    if (!formData.phone) {
      errors.phone = "El teléfono es obligatorio.";
    } else if (!/^\d+$/.test(formData.phone)) {
      errors.phone = "El teléfono solo debe contener números.";
    }
    if (!formData.address) {
      errors.address = "La dirección es obligatoria.";
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };
  

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validateForm()) {
      // Simular el envío del formulario
      console.log("Datos del cliente:", formData);
      toast.success("Cliente añadido exitosamente!");

      // Resetea el formulario después de enviar
      setFormData({
        customerName: "",
        email: "",
        phone: "",
        address: "",
      });

      // Cierra el modal
      document.querySelector("#add-units button[data-bs-dismiss='modal']").click();
    } else {
      toast.error("Por favor, completa todos los campos obligatorios.");
    }
  };

  return (
    <>
      <ToastContainer />
      {/* Add Customer */}
      <div className="modal fade" id="add-units">
        <div className="modal-dialog modal-dialog-centered custom-modal-two">
          <div className="modal-content">
            <div className="page-wrapper-new p-0">
              <div className="content">
                <div className="modal-header border-0 custom-modal-header">
                  <div className="page-title">
                    <h4>Añadir Cliente</h4>
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
                          <label className="form-label">Nombre Cliente</label>
                          <input
                            type="text"
                            className={`form-control ${formErrors.customerName ? "is-invalid" : ""}`}
                            name="customerName"
                            value={formData.customerName}
                            onChange={handleInputChange}
                          />
                          {formErrors.customerName && (
                            <div className="invalid-feedback">{formErrors.customerName}</div>
                          )}
                        </div>
                      </div>
                      <div className="col-lg-4 pe-0">
                        <div className="mb-3">
                          <label className="form-label">Correo</label>
                          <input
                            type="email"
                            className={`form-control ${formErrors.email ? "is-invalid" : ""}`}
                            name="email"
                            value={formData.email}
                            onChange={handleInputChange}
                          />
                          {formErrors.email && (
                            <div className="invalid-feedback">{formErrors.email}</div>
                          )}
                        </div>
                      </div>
                      <div className="col-lg-4 pe-0">
                        <div className="input-blocks">
                          <label className="mb-2">Telefono</label>
                          <input
                            className={`form-control form-control-lg group_formcontrol ${formErrors.phone ? "is-invalid" : ""}`}
                            id="phone"
                            name="phone"
                            type="text"
                            value={formData.phone}
                            onChange={handleInputChange}
                          />
                          {formErrors.phone && (
                            <div className="invalid-feedback">{formErrors.phone}</div>
                          )}
                        </div>
                      </div>
                      <div className="col-lg-12 pe-0">
                        <div className="mb-3">
                          <label className="form-label">Direccion</label>
                          <input
                            type="text"
                            className={`form-control ${formErrors.address ? "is-invalid" : ""}`}
                            name="address"
                            value={formData.address}
                            onChange={handleInputChange}
                          />
                          {formErrors.address && (
                            <div className="invalid-feedback">{formErrors.address}</div>
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
                      <button type="submit" className="btn btn-submit">
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
      {/* /Add Customer */}
    </>
  );
};

export default AddCustomer;

