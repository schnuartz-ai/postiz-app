import { ArrayMaxSize, IsArray, IsString, MaxLength } from 'class-validator';

export class NostrSettingsDto {
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  blossomServers: string[];

  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  relays: string[];
}
