import forge from 'node-forge';

const publicKeyPem = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCurHItZ1k6oX69/QTaeChCTfbd
9Dcgat+hGEFNWSnjtjImg6aHg8VVi7cDsC95Sl3mmAnenBWtZJRN/5jB7spxGd9V
vk6YJlc108wcD0ZlgTJ9unmBmX5PLyeZDNpdBrxl10jaYvyLa99d/RGODDASBiOb
JRsGAxC3UqHpTTZkNwIDAQAB
-----END PUBLIC KEY-----`;

export function encriptarContrasena(contrasena) {
  try {
    const publicKey = forge.pki.publicKeyFromPem(publicKeyPem);
    const encryptedData = publicKey.encrypt(forge.util.encodeUtf8(contrasena), 'RSA-OAEP');
    return {
      success: true,
      contrasena_encriptada: forge.util.encode64(encryptedData),
      message: 'Encriptación exitosa'
    };
  } catch (error) {
    return {
      success: false,
      message: 'Error durante la encriptación'
    };
  }
}