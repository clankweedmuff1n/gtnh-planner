package com.bigbass.recex.autorun;

import com.bigbass.recex.RecipeExporterMod;
import cpw.mods.fml.common.eventhandler.SubscribeEvent;
import cpw.mods.fml.common.gameevent.TickEvent;
import net.minecraft.client.Minecraft;

public final class ClientAutorunExportHandler {

    private int ticks;
    private boolean started;

    @SubscribeEvent
    public void onClientTick(TickEvent.ClientTickEvent event) {
        if (event.phase != TickEvent.Phase.END || started) {
            return;
        }

        ticks++;
        if (ticks < Integer.getInteger("recex.autorunDelayTicks", 220)) {
            return;
        }

        Minecraft minecraft = Minecraft.getMinecraft();
        if (minecraft == null || minecraft.getTextureManager() == null || minecraft.fontRenderer == null) {
            return;
        }

        started = true;
        RecipeExporterMod.log.info("RecEx autorun client tick handler is ready after " + ticks + " ticks.");

        RecipeExporterMod.requestAutorunExport("client-proxy-tick");
    }
}
