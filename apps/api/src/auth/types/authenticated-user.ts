import { Rol } from '@adn/shared';

export interface AuthenticatedUser {
  id: string;
  email: string;
  rol: Rol;
}
