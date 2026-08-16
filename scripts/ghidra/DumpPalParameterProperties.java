// Dump the reflected Pal parameter fields surrounding CombiRank.
// @category Paldeck

import java.io.File;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;

import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.mem.Memory;

public class DumpPalParameterProperties extends GhidraScript {
	@Override
	public void run() throws Exception {
		if (getScriptArgs().length != 1) {
			throw new IllegalArgumentException("Expected output file path.");
		}
		Memory memory = currentProgram.getMemory();
		Address table = toAddr(0x1473d04f8L);
		try (PrintWriter writer = new PrintWriter(new File(getScriptArgs()[0]), StandardCharsets.UTF_8)) {
			for (int slot = -80; slot <= 80; slot++) {
				Address descriptor = toAddr(memory.getLong(table.add(slot * 8L)));
				if (!memory.contains(descriptor)) {
					continue;
				}
				Address nameAddress = toAddr(memory.getLong(descriptor));
				String name = readAscii(memory, nameAddress);
				long offset = memory.getLong(descriptor.add(56));
				long alternateOffset = memory.getLong(descriptor.add(64));
				long boolLayout = memory.getLong(descriptor.add(72));
				writer.printf("slot=%+d descriptor=%s offset=0x%x alternate=0x%x bool=0x%x name=%s%n", slot, descriptor, offset, alternateOffset, boolLayout, name);
			}
		}
	}

	private String readAscii(Memory memory, Address address) throws Exception {
		if (!memory.contains(address)) {
			return "(invalid)";
		}
		StringBuilder value = new StringBuilder();
		for (int index = 0; index < 256; index++) {
			byte current = memory.getByte(address.add(index));
			if (current == 0) {
				break;
			}
			if (current < 0x20 || current > 0x7e) {
				return "(non-ascii)";
			}
			value.append((char) current);
		}
		return value.toString();
	}
}
