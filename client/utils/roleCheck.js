export function isAdminSuperUse(user) {
  /* 
  id, name,       displayOrder
  1,  admin,      2
  2,  super user, 1
  3,  user,       0
  */
  return user?.() && (user?.()?.Role?.name === "admin" || user?.()?.Role?.name === "super user");
}